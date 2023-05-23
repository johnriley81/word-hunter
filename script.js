let isMouseDown = false;
let time = 60;
let intervalId;
let grid;
let isGameActive = false;
let longestWord = "";
let sponsorMsg = "Sponsored by: No One"
let websiteLink = "https://wordhunter.onrender.com"

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
  const closeRules = document.querySelector("#close-rules");
  const doneButton = document.querySelector("#done-button");
  const swapButton = document.querySelector("#swap-button");
  swapButton.disabled = true;

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
  closeRules.addEventListener("click", function () {
    rules.classList.remove("visible");
    rules.classList.add("hidden");
    grid.classList.remove("hidden");
    grid.classList.add("visible");
  });
  rulesButton.addEventListener("click", function () {
    rules.classList.remove("hidden");
    rules.classList.add("visible");
    grid.classList.remove("visible");
    grid.classList.add("hidden");
  });
  document;

  messageLabel.addEventListener("click", function () {
    if (!isGameActive) {
      copyToClipboard(score, longestWord, diffDays);
    }
  });

  doneButton.addEventListener("click", endGame);

  function startGame() {
    isGameActive = true;
    startButton.style.display = "none"; // Hide start button
    document.querySelector("#current-word").classList.remove("hidden");
    document.querySelector("#current-word").classList.add("visible");
    document.getElementById("next-letters-container").classList.add("visible");
    document.querySelector("#done-button").classList.remove("hidden");
    document.querySelector("#done-button").classList.add("visible");
    document.querySelector("#swap-button").classList.remove("hidden");
    document.querySelector("#swap-button").classList.add("visible");

    const buttons = grid.getElementsByClassName("grid-button");
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].disabled = false; // Enable the buttons
      buttons[i].classList.add("grid-button--active");
      buttons[i].classList.remove("grid-button--inactive");
    }

    score = 0;
    currentWord = "";
    nextLetters = generateNextLetters();
    showMessage("Good Luck");
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
    const start = new Date("2023-05-20");
    const diffTime = Math.abs(now - start);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  function startTimer() {
    // Clear the previous timer
    if (intervalId) {
      clearInterval(intervalId);
    }

    time = 60;
    timerElement.textContent = "Time: " + time;

    // Start a new timer
    intervalId = setInterval(() => {
      time -= 1;
      timerElement.textContent = "Time: " + time;

      if (time <= 0) {
        clearInterval(intervalId);
        endGame();
      }
    }, 1000);
  }

  function handleTouchStart(event) {
    if (!isGameActive) return;
    handleMouseDown(event);
  }

  function handleTouchMove(event) {
    if (!isGameActive) return;
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
    if (event.target.classList.contains("grid-button")) {
      const touch = event.changedTouches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const mockEvent = { target: element, preventDefault: () => {} };
      handleMouseUp(mockEvent);
    }
  }

  function handleMouseDown(event) {
    if (!isGameActive) return;
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

  function handleMouseOver(event) {
    if (!isGameActive) return;
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

          line.setAttribute("stroke", "white");
          document.querySelector("#line-container").appendChild(line);
        }
      }
      lastButton = event.target;
      updateCurrentWord();
    }
  }

  function handleMouseUp(event) {
    if (!isGameActive) return;
    if (isMouseDown) {
      isMouseDown = false;
      if (currentWord.length > 2) {
        if (validateWord(currentWord)) {
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
          showMessage("INVALID", 1, "maroon");
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

    // Check for horizontal/vertical adjacency (difference is 1 or 4)
    const isHorizontalOrVertical = diff === 1 || diff === 4;

    // Check for diagonal adjacency
    const isDiagonal =
      (diff === 5 &&
        ((index1 % 4 !== 3 && index2 % 4 !== 0) ||
          (index1 % 4 !== 0 && index2 % 4 !== 3))) ||
      (diff === 3 &&
        ((index1 % 4 !== 0 && index2 % 4 !== 3) ||
          (index1 % 4 !== 3 && index2 % 4 !== 0)));

    return isHorizontalOrVertical || isDiagonal;
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

    // Hide Done and Swap buttons
    doneButton.classList.add("hidden");
    doneButton.classList.remove("visible");
    swapButton.classList.add("hidden");
    swapButton.classList.remove("visible");

    showMessage("Game Over", 3);
    setTimeout(function () {
      messageLabel.textContent = "Copy Score";
      messageLabel.style.color = "black";
      messageLabel.classList.remove("hidden");
      messageLabel.classList.add("visible");
      nextLettersElement.textContent = sponsorMsg;
    }, 6000);
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
    navigator.clipboard
      .writeText(
        `WordHunter #${diffDays} 🏹${score}\n🏆 ${longestWord.toUpperCase()} 🏆\n${websiteLink}`
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
});
