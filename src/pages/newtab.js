function go(value) {
  const input = String(value || "").trim();

  if (!input) {
    return;
  }

  if (/^(https?|file):\/\//i.test(input)) {
    window.location.href = input;
    return;
  }

  if (input.includes(".") && !input.includes(" ")) {
    window.location.href = `https://${input}`;
    return;
  }

  window.location.href =
    `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

const searchForm = document.getElementById("searchForm");
const query = document.getElementById("query");
const luckyButton = document.getElementById("luckyButton");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  go(query.value);
});

luckyButton.addEventListener("click", () => {
  const input = query.value.trim();

  if (!input) {
    query.focus();
    return;
  }

  window.location.href =
    `https://www.google.com/search?btnI=1&q=${encodeURIComponent(input)}`;
});
