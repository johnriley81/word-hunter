let isMouseDown = false;
let time = 60;
let intervalId;
let grid;
let isGameActive = false;
let longestWord = "";
let sponsorMsg = "Now with: 3 SWAPs!!";
let websiteLink = "https://wordhunter.io/";
let leaderboardLink = "https://johnriley81.pythonanywhere.com/leaderboard/";
let hardMode = false;
let asterisk = "";
let playerPosition;
let isEndgame = false;
let sounds = {
  click: new Audio("sounds/click.wav"),
  bing: new Audio("sounds/bing.wav"),
  bing2: new Audio("sounds/bing2.wav"),
  invalid: new Audio("sounds/invalid.wav"),
  pop: new Audio("sounds/pop.wav"),
  swoosh: new Audio("sounds/swoosh.wav"),
  tick: new Audio("sounds/tick.wav"),
  gameOver: new Audio("sounds/gameOver.wav"),
};

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.querySelector("#grid");
  const startButton = document.querySelector("#start");
  startButton.disabled = true;
  const currentWordElement = document.querySelector("#current-word");
  const nextLettersElement = document.querySelector("#next-letters");
  nextLettersElement.textContent = sponsorMsg;
  const messageLabel = document.querySelector("#message-label");
  const timerElement = document.querySelector("#timer");
  const scoreElement = document.querySelector("#score");
  const rules = document.querySelector("#rules");
  const rulesButton = document.querySelector("#rules-button");
  const muteButton = document.getElementById("mute-button");
  const closeRules = document.querySelector("#close-rules");
  const doneButton = document.querySelector("#done-button");
  const swapButton = document.querySelector("#swap-button");
  const retryButton = document.querySelector("#retry-button");
  const hardModeCheckbox = document.getElementById("hard-mode");
  const hardModeLabel = document.getElementById("hard-mode-label");
  const hardModeContainer = document.getElementById("hard-mode-container");
  const gridLineContainer = document.querySelector("#line-container");
  const leaderboardElements = document.getElementById("leaderboard-elements");
  const leaderboardTable = document.getElementById("leaderboard-table");
  const playerName = document.getElementById("player-name");
  const leaderboardButton = document.getElementById("leaderboard-button");

  let score = 0;
  let currentWord = "";
  let nextLetters = [];
  let selectedButtons = [];
  let selectedButtonSet = new Set();
  let lastButton = null;
  let wordList = [];
  let gridsList = [];
  let diffDays = 0;
  let nextLettersList = [];
  let isSwapEnabled = false;
  let isSwapValid = false;
  let swapTiles = [];
  let scoreValidation = [];
  let isPaused = false;
  let isMuted = true;
  let swapCount = 3;

  for (var key in sounds) {
    sounds[key].load();
  }

  fetch("text/wordlist.txt")
    .then((response) => response.text())
    .then((data) => {
      wordList = data.toLowerCase().split("\n");

      // Fetch grids.txt after wordlist.txt has been fetched
      return fetch("text/grids.txt");
    })
    .then((response) => response.text())
    .then((data) => {
      gridsList = data.split("\n").map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error("Error parsing line:", line);
          console.error("Parse error:", error);
        }
      });

      // Fetch nextletters.txt after grids.txt has been fetched
      return fetch("text/nextletters.txt");
    })
    .then((response) => response.text())
    .then((data) => {
      nextLettersList = data.split("\n").map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error("Error parsing line:", line);
          console.error("Parse error:", error);
        }
      });

      // Call generateGrid() after all files have been fetched
      generateGrid();
      startButton.disabled = false;
    })
    .catch((error) => {
      console.error("Fetch error:", error);
    });

  document.addEventListener("touchend", handleTouchEnd);
  document.addEventListener("mouseup", handleMouseUp);
  startButton.addEventListener("click", startGame);
  hardModeCheckbox.addEventListener("click", handleHardMode);
  swapButton.addEventListener("click", handleSwap);
  retryButton.addEventListener("click", function () {
    playSound("click", isMuted);
    window.location.reload();
  });
  closeRules.addEventListener("click", function () {
    rules.classList.remove("visible");
    rules.classList.add("hidden");
    grid.classList.remove("hidden");
    grid.classList.add("visible");
    isPaused = false;
  });
  rulesButton.addEventListener("click", function () {
    rules.classList.remove("hidden");
    rules.classList.add("visible");
    grid.classList.remove("visible");
    grid.classList.add("hidden");
    isPaused = true;
  });
  muteButton.addEventListener("click", function () {
    if (isMuted) {
      isMuted = false;
      muteButton.textContent = "🔔";
    } else {
      isMuted = true;
      muteButton.textContent = "🔕";
    }
  });

  messageLabel.addEventListener("click", function () {
    if (!isGameActive) {
      copyToClipboard(score, longestWord, diffDays);
    }
  });

  doneButton.addEventListener("click", endGame);
  leaderboardButton.addEventListener("click", getLeaderboard);

  function startGame() {
    playSound("click", isMuted);
    playSound("bing", true);
    playSound("bing2", true);
    playSound("invalid", true);
    playSound("tick", true);
    isGameActive = true;
    timerElement.style.color = "white";
    startButton.style.display = "none"; // Hide start button
    hardModeContainer.style.display = "none"; // Hide hardMode checkbox
    currentWordElement.classList.remove("hidden");
    currentWordElement.classList.add("visible");
    document
      .getElementById("next-letters-container")
      .classList.add("visibleDisplay");
    doneButton.classList.remove("hidden");
    doneButton.classList.add("visibleDisplay");
    swapButton.classList.remove("hidden");
    swapButton.classList.add("visibleDisplay");

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = false; // Enable the buttons
      buttons[i].classList.add("grid-button--active");
      buttons[i].classList.remove("grid-button--inactive");
    }

    score = 0;
    currentWord = "";
    nextLetters = generateNextLetters();
    showMessage("Good Luck", 1, "gold");
    updateScore();
    updateCurrentWord();
    updateNextLetters();
    startTimer();
  }

  function generateGrid() {
    diffDays = calculateDiffDays();
    const gridLetters = gridsList[diffDays % gridsList.length];

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const button = document.createElement("button");
        button.textContent = gridLetters[i][j];
        button.classList.add("grid-button");
        button.classList.add("grid-button--inactive");
        button.disabled = true;
        button.addEventListener("mousedown", handleMouseDown);
        button.addEventListener("mouseover", handleMouseOver);
        button.addEventListener("touchstart", handleTouchStart);
        button.addEventListener("touchmove", handleTouchMove);
        grid.appendChild(button);
      }
    }

    let svgContainer = document.getElementById("line-container");
    svgContainer.style.width = grid.offsetWidth + "px";
    svgContainer.style.height = "400px";
  }

  function generateNextLetters() {
    diffDays = calculateDiffDays();
    nextLetters = nextLettersList[diffDays % nextLettersList.length];
    return nextLetters;
  }

  function handleSwap() {
    if (isSwapEnabled && isSwapValid) {
      swapCount = swapCount - 1;
      playSound("swoosh", isMuted);
      if (swapCount != 1) {
        showMessage(`${swapCount} swaps remaining`, 1, "gold");
      } else {
        showMessage(`${swapCount} swap remaining`, 1, "gold");
      }
      // Swap the letters of the two tiles
      swapLetters(swapTiles[0], swapTiles[1]);
      swapTiles = [];
      isSwapEnabled = false;
      isSwapValid = false;
      swapButton.textContent = "SWAP";
      if (swapCount == 0) {
        swapButton.style.backgroundColor = "gray";
        swapButton.disabled = true;
      } else {
        swapButton.style.backgroundColor = "#fcebc7";
      }
    } else if (isSwapEnabled) {
      playSound("click", isMuted);
      // User tried to swap while it wasn't valid
      swapTiles.forEach((tile) => tile.classList.remove("selected-swap"));
      swapTiles = [];
      isSwapEnabled = false;
      swapButton.style.backgroundColor = "#fcebc7";
      swapButton.textContent = "SWAP";
      showMessage("Swap exited", 1, "gold");
    } else {
      playSound("click", isMuted);
      isSwapEnabled = true;
      swapButton.style.backgroundColor = "lightblue";
      swapButton.textContent = "BACK";
      showMessage("Tap 2 tiles to swap", 1, "gold");
    }
  }

  function swapLetters(tile1, tile2) {
    // Swap the letters of tile1 and tile2
    const temp = tile1.textContent;
    tile1.textContent = tile2.textContent;
    tile2.textContent = temp;

    // Reset the selected state of the tiles
    tile1.classList.remove("selected-swap");
    tile2.classList.remove("selected-swap");
  }

  function updateScore() {
    scoreElement.textContent = "Score: " + score;
  }

  function updateCurrentWord() {
    currentWordElement.textContent = currentWord;
  }

  function updateNextLetters() {
    let displayedNextLetters = nextLetters.slice(0, 10).join(", ");

    if (nextLetters.length > 10) {
      displayedNextLetters += "...";
    }

    nextLettersElement.textContent = displayedNextLetters;
  }

  // Helper function to calculate the difference in days between two dates
  function calculateDiffDays() {
    const now = new Date();
    const start = new Date(2023, 4, 20);

    const diffTime = Math.abs(now - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  function startTimer() {
    // Clear the previous timer
    if (intervalId) {
      clearInterval(intervalId);
    }

    if (hardMode) {
      time = 30;
    } else {
      time = 60;
    }

    timerElement.textContent = "Time: " + time;
    timerElement.style.color = "white";

    intervalId = setInterval(() => {
      if (isPaused) {
        return;
      }

      time -= 1;
      timerElement.textContent = "Time: " + time;

      if (time <= 10) {
        playSound("tick", isMuted);
        timerElement.style.color = time % 2 === 0 ? "red" : "white";
      }

      if (time <= 0) {
        clearInterval(intervalId);
        endGame();
      }
    }, 1000);
  }

  function handleHardMode() {
    playSound("click", isMuted);
    hardMode = hardModeCheckbox.checked;
    if (hardMode) {
      hardModeLabel.style.color = "black";
      time = 30;
      timerElement.textContent = "Time: 30";
      timerElement.style.color = "red";
      asterisk = "*";
    } else {
      hardModeLabel.style.color = "white";
      time = 60;
      timerElement.textContent = "Time: 60";
      timerElement.style.color = "white";
      asterisk = "";
    }
  }

  function handleTouchStart(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) {
      const mockEvent = { target: event.target, preventDefault: () => {} };
      handleMouseUp(mockEvent);
    } else {
      handleMouseDown(event);
    }
  }

  function handleTouchMove(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) return;
    event.preventDefault();
    const touch = event.touches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);

    if (element && element.classList.contains("grid-button")) {
      // create a mock event object
      const mockEvent = {
        target: element,
        preventDefault: () => {}, // noop function
      };

      handleMouseOver(mockEvent);
    }
  }

  function handleTouchEnd(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) return;
    if (event.target.classList.contains("grid-button")) {
      const mockEvent = { target: event.target, preventDefault: () => {} };
      handleMouseUp(mockEvent);
    }
  }

  function handleMouseDown(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) {
      if (event.target.classList.contains("selected-swap")) {
        playSound("pop", isMuted);
        // Deselecting a previously selected tile
        event.target.classList.remove("selected-swap");
        swapTiles = swapTiles.filter((tile) => tile !== event.target);
      } else if (swapTiles.length < 2) {
        playSound("pop", isMuted);
        // Selecting a new tile
        event.target.classList.add("selected-swap");
        swapTiles.push(event.target);
      }

      if (swapTiles.length === 2) {
        isSwapValid = true;
        swapButton.textContent = "SWAP";
      } else {
        isSwapValid = false;
        swapButton.textContent = "BACK";
      }
    } else {
      if (
        event.target.classList.contains("grid-button") &&
        event.target.textContent !== "" &&
        (lastButton === null || isAdjacent(lastButton, event.target))
      ) {
        isMouseDown = true;
        currentWord += event.target.textContent;
        selectedButtons.push(event.target);
        selectedButtonSet.add(event.target);
        event.target.classList.add("selected");
        lastButton = event.target;
        messageLabel.textContent = "";
        updateCurrentWord();
      }
    }
  }

  function handleMouseOver(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) return;
    if (
      isMouseDown &&
      event.target.textContent !== "" &&
      (lastButton === null || isAdjacent(lastButton, event.target))
    ) {
      if (event.target === selectedButtons[selectedButtons.length - 2]) {
        const removedButton = selectedButtons.pop();
        currentWord = currentWord.slice(0, -1);

        // Remove the corresponding line
        const lineContainer = document.querySelector("#line-container");
        lineContainer.lastChild.remove();

        // Check if this button is still part of the word
        if (!selectedButtons.includes(removedButton)) {
          removedButton.classList.remove("selected");
          selectedButtonSet.delete(removedButton);
        }
      } else {
        currentWord += event.target.textContent;
        selectedButtons.push(event.target);
        selectedButtonSet.add(event.target);
        event.target.classList.add("selected");

        // Add a line from the last button to this one
        if (lastButton) {
          const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
          );

          const lastRect = lastButton.getBoundingClientRect();
          const currRect = event.target.getBoundingClientRect();

          line.setAttribute(
            "x1",
            lastRect.left +
              lastRect.width / 2 -
              grid.getBoundingClientRect().left
          );
          line.setAttribute(
            "y1",
            lastRect.top +
              lastRect.height / 2 -
              grid.getBoundingClientRect().top
          );
          line.setAttribute(
            "x2",
            currRect.left +
              currRect.width / 2 -
              grid.getBoundingClientRect().left
          );
          line.setAttribute(
            "y2",
            currRect.top +
              currRect.height / 2 -
              grid.getBoundingClientRect().top
          );

          // transform line from orange to red
          const wordLength = selectedButtons.length;
          let color;
          let lettersChange = 8;
          if (wordLength <= lettersChange) {
            colorChange = Math.round(
              255 - (255 / lettersChange) * (wordLength - 1)
            );
            color = `rgb(255, ${colorChange}, 0)`;
          } else {
            color = `rgb(255, 0, 0)`;
          }
          line.setAttribute("stroke", color);
          line.setAttribute("stroke-width", "3");

          document.querySelector("#line-container").appendChild(line);
        }
      }
      lastButton = event.target;
      updateCurrentWord();
    }
  }

  function handleMouseUp(event) {
    if (!isGameActive) return;
    if (isSwapEnabled) return;
    if (isMouseDown) {
      isMouseDown = false;
      if (currentWord.length > 2) {
        if (validateWord(currentWord)) {
          if (currentWord.length >= 5) {
            playSound("bing2", isMuted);
          } else {
            playSound("bing", isMuted);
          }
          scoreValidation.push([
            currentWord,
            getLetters(),
            selectedButtonSet.size,
          ]);
          console.log(scoreValidation);
          const wordScore = getWordScore(currentWord);
          score += wordScore;
          showMessage(
            `${currentWord.toUpperCase()} +${wordScore}`,
            1,
            "lightgreen"
          );
          if (currentWord.length >= longestWord.length) {
            longestWord = currentWord;
          }
          updateScore();
          replaceLetters();
          startTimer();
        } else {
          playSound("invalid", isMuted);
          showMessage("INVALID", 1, "red");
        }
      }
      currentWord = "";
      selectedButtons.forEach((button) => {
        button.classList.remove("selected");
      });
      updateCurrentWord();
      selectedButtons.forEach((button) => {
        button.selected = false;
      });
      selectedButtons = [];
      selectedButtonSet = new Set();
      lastButton = null;
      const lineContainer = document.querySelector("#line-container");
      while (lineContainer.firstChild) {
        lineContainer.firstChild.remove();
      }
    }
  }

  function isAdjacent(button1, button2) {
    const index1 = Array.prototype.indexOf.call(grid.children, button1);
    const index2 = Array.prototype.indexOf.call(grid.children, button2);
    const diff = Math.abs(index1 - index2);

    const isHorizontal =
      diff === 1 && Math.floor(index1 / 4) === Math.floor(index2 / 4);
    const isVertical = diff === 4;
    const isDiagonal =
      (diff === 5 || diff === 3) &&
      Math.abs(Math.floor(index1 / 4) - Math.floor(index2 / 4)) === 1;

    return isHorizontal || isVertical || isDiagonal;
  }

  function replaceLetters() {
    const uniqueSelectedButtons = Array.from(selectedButtonSet);
    uniqueSelectedButtons.sort(
      (a, b) =>
        Array.from(selectedButtonSet).indexOf(a) -
        Array.from(selectedButtonSet).indexOf(b)
    );
    uniqueSelectedButtons.forEach((button) => {
      const nextLetter = nextLetters.shift() || "";
      button.textContent = nextLetter;
    });
    selectedButtonSet.clear();
    lastButton = null;
    updateNextLetters();
  }

  function showMessage(message, flashTimes = 1, color = "white") {
    const messageLabel = document.querySelector("#message-label");
    messageLabel.textContent = message;
    messageLabel.style.color = color; // Set the color
    messageLabel.classList.remove("hidden");
    messageLabel.classList.add("visible");

    if (flashTimes > 1) {
      setTimeout(() => {
        messageLabel.classList.remove("visible");
        messageLabel.classList.add("hidden");
        setTimeout(() => {
          showMessage(message, flashTimes - 1, color);
        }, 1000);
      }, 1000);
    } else {
      setTimeout(() => {
        messageLabel.classList.remove("visible");
        messageLabel.classList.add("hidden");
      }, 1000);
    }
  }

  function endGame() {
    if (score > 50) {
      playSound("gameOver", isMuted);
    } else {
      playSound("click", isMuted);
    }
    isEndgame = true;
    isGameActive = false;
    clearInterval(intervalId);

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      buttons[i].classList.remove("grid-button--active");
      buttons[i].classList.add("grid-button--inactive");
      buttons[i].classList.remove("selected");
      buttons[i].style.color = "black";
    }
    currentWord = "";
    updateCurrentWord();
    const lineContainer = document.querySelector("#line-container");
    while (lineContainer.firstChild) {
      lineContainer.firstChild.remove();
    }

    // Hide Rules, Done and Swap buttons
    rulesButton.classList.add("hiddenDisplay");
    rulesButton.classList.add("hidden");
    rulesButton.classList.remove("visible");
    muteButton.classList.add("hiddenDisplay");
    muteButton.classList.add("hidden");
    muteButton.classList.remove("visible");
    doneButton.classList.add("hiddenDisplay");
    doneButton.classList.remove("visibleDisplay");
    swapButton.classList.add("hiddenDisplay");
    swapButton.classList.remove("visibleDisplay");

    // Show Retry button
    retryButton.classList.remove("hiddenDisplay");
    retryButton.classList.add("visibleDisplay");

    // Log user score
    console.log(
      `puzzle: ${diffDays}, score: ${score}${asterisk}, trophy: ${longestWord}`
    );

    showMessage("Game Over", 2, "gold");
    // Fetch the leaderboard right after game ends
    getLeaderboard();
    leaderboardTable.classList.add("hidden");

    setTimeout(function () {
      messageLabel.textContent = "Copy Score";
      messageLabel.style.color = "gold";
      messageLabel.classList.remove("hidden");
      messageLabel.classList.add("visible");
      nextLettersElement.textContent = sponsorMsg;

      // Leaderboard elements
      grid.classList.remove("visible");
      grid.classList.remove("visibleDisplay");
      grid.classList.add("hidden");
      grid.classList.add("hiddenDisplay");
      gridLineContainer.classList.remove("visible");
      gridLineContainer.classList.remove("visibleDisplay");
      gridLineContainer.classList.remove("hiddenDisplay");
      leaderboardElements.classList.add("visibleDisplay");
      leaderboardElements.classList.remove("hiddenDisplay");
      leaderboardTable.classList.remove("hidden");
      leaderboardTable.classList.remove("hiddenDisplay");
      leaderboardTable.classList.add("visibleDisplay");
      playerName.classList.remove("hiddenDisplay");
      playerName.classList.add("hidden");
      leaderboardButton.classList.remove("hiddenDisplay");
      leaderboardButton.classList.add("hidden");
      if (score >= 50) {
        playerName.classList.remove("hidden");
        playerName.classList.add("visibleDisplay");
        leaderboardButton.classList.remove("hidden");
        leaderboardButton.classList.add("visibleDisplay");
      }
    }, 4000);
  }

  async function getLeaderboard(clicked = false) {
    if (clicked) {
      playSound("click", isMuted);
      playerName.disabled = true;
      leaderboardButton.disabled = true;
      leaderboardButton.style.backgroundColor = "gray";
    }

    let requestURL = `${leaderboardLink}${diffDays}`;

    let requestOptions = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (score > 50 && playerName.value != "") {
      requestOptions.method = "POST";
      requestOptions.body = JSON.stringify({
        player: playerName.value,
        hard: hardMode,
        score: score,
        trophy: longestWord,
        // scoreValidation: scoreValidation,
      });
    }

    // make the API request
    let response = await fetch(requestURL, requestOptions);
    console.log(requestOptions.body);
    let data = await response.json();

    // handle the response
    let leaderboard = JSON.parse(data["body"]); // get the leaderboard from the response
    if (score > 50 && playerName.value != "") {
      leaderboard = JSON.parse(data["body"]).top_10;
    }

    // clear the existing leaderboard table
    leaderboardTable.innerHTML = "";

    // create a table body
    let tbody = document.createElement("tbody");

    // add the table header
    let headerRow = document.createElement("tr");
    ["#", "👤", "🏹", "🏆"].forEach((headerText) => {
      let th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    headerRow.style.backgroundColor = "black";
    headerRow.style.color = "white";
    tbody.appendChild(headerRow);

    // add the new leaderboard rows
    leaderboard.forEach((row, index) => {
      let tr = document.createElement("tr");
      let [player, hardMode, rowScore, rowTrophy] = row;

      // Determine the color of the row
      let color = "white"; // default color
      if (hardMode === 1) {
        color = "#ff474c";
      }
      if (
        player === playerName.value &&
        rowScore === score &&
        rowTrophy === longestWord
      ) {
        playerPosition = index + 1;
        console.log(playerPosition);
        color = "gold";
      }

      if (player === "doughack") {
        player = "doug";
        color = "magenta";
      }

      tr.style.color = color;

      // Determine the displayed position (medal or number)
      let positionDisplay;
      if (index === 0) {
        positionDisplay = "🥇";
      } else {
        positionDisplay = index + 1;
      }

      [positionDisplay, player, rowScore, rowTrophy].forEach(
        (cellText, cellIndex) => {
          let td = document.createElement("td");
          td.textContent = cellText;

          // Add class for first and third columns
          if (cellIndex === 0 || cellIndex === 2) {
            td.classList.add("centered-cell");
          }

          tr.appendChild(td);
        }
      );
      tbody.appendChild(tr);
    });

    leaderboardTable.appendChild(tbody);
  }

  function getLetters() {
    let letters = "";
    const tiles = document.querySelectorAll(".grid-button"); // replace .grid-button with your actual selector

    tiles.forEach((tile) => {
      let tileText = tile.textContent; // or .innerText or .innerHTML, whichever contains the letter
      letters += tileText;
    });

    return letters;
  }

  function getWordScore(word) {
    // Adjust the score calculation as per your rules
    if (word.length <= 3) {
      return word.length;
    } else {
      let extraPoints = 0;
      for (let i = 4; i <= word.length; i++) {
        extraPoints += i - 2;
      }
      return 3 + extraPoints;
    }
  }

  function copyToClipboard(score, longestWord, diffDays) {
    playSound("click", isMuted);
    let leaderboardText = "";
    if (playerPosition) {
      leaderboardText = `I'm #${playerPosition} on `;
    }
    navigator.clipboard
      .writeText(
        `${leaderboardText}WordHunter #${diffDays} 🏹${score}${asterisk}\n🏆 ${longestWord.toUpperCase()} 🏆\n${websiteLink}`
      )
      .then(function () {
        alert("Score copied to clipboard");
      })
      .catch(function (err) {
        alert("FAIL\n\nUnable to copy score to clipboard");
        console.log("Error in copyToClipboard:", err);
      });
  }

  function validateWord(word) {
    return wordList.includes(word.toLowerCase());
  }

  function playSound(name, muted) {
    let sound = sounds[name];
    sound.muted = muted;
    sound.play();
  }
});
