import { appConfig } from "../config/firebase-config.js";

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const currencyFormatter = new Intl.NumberFormat(appConfig.locale, {
  style: "currency",
  currency: appConfig.currency,
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat(appConfig.locale, {
  year: "numeric",
  month: "long",
  day: "numeric"
});

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatDisplayDate(dateString) {
  if (!dateString) {
    return "--";
  }

  return dateFormatter.format(new Date(`${dateString}T00:00:00`));
}

export function formatShortMonth(date) {
  return new Intl.DateTimeFormat(appConfig.locale, {
    month: "long",
    year: "numeric"
  }).format(date);
}

export function showToast(message, type = "info") {
  const toast = $("#toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

export function setElementLoading(element, isLoading, loadingText = "جاري التنفيذ...") {
  if (!element) {
    return;
  }

  if (isLoading) {
    element.dataset.originalText = element.textContent;
    element.disabled = true;
    element.textContent = loadingText;
    return;
  }

  element.disabled = false;
  if (element.dataset.originalText) {
    element.textContent = element.dataset.originalText;
  }
}

export function setStatus(element, message, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-error", isError);
  element.classList.remove("hidden");
}

export function clearStatus(element) {
  if (!element) {
    return;
  }

  element.textContent = "";
  element.classList.remove("is-error");
  element.classList.add("hidden");
}

export function saveCache(key, data) {
  const payload = {
    version: appConfig.cacheVersion,
    updatedAt: Date.now(),
    data
  };

  localStorage.setItem(key, JSON.stringify(payload));
}

export function loadCache(key, fallback = null) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (!cached || cached.version !== appConfig.cacheVersion) {
      return fallback;
    }

    return cached.data;
  } catch (error) {
    console.warn("Cache parsing failed", error);
    return fallback;
  }
}

export function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

export function slugify(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u0600-\u06ff-]/g, "");
}

export function sanitizeText(value = "") {
  return String(value).trim();
}

export function sanitizePhone(value = "") {
  return String(value).replace(/[^\d+]/g, "").trim();
}

export function isValidPhone(value) {
  return /^[+\d]{8,15}$/.test(sanitizePhone(value));
}

export function isValidDateRange(from, to) {
  return Boolean(from && to && from <= to);
}

export function eachDateInRange(from, to) {
  if (!isValidDateRange(from, to)) {
    return [];
  }

  const dates = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (cursor <= end) {
    dates.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function toDateInputValue(date) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
}

export function addMonths(date, amount) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + amount);
  return result;
}

export function monthMatrix(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const offset = start.getDay();
  const total = end.getDate();
  const cells = [];

  for (let i = 0; i < offset; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= total; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function isPastDate(dateString) {
  const today = toDateInputValue(new Date());
  return dateString < today;
}

export function rangeIncludes(dateString, from, to) {
  return Boolean(from && to && dateString >= from && dateString <= to);
}

export function buildCalendarMonth(monthDate, availabilityMap, selection = {}) {
  const weekdays = ["ح", "ن", "ث", "ر", "خ", "ج", "س"];
  const cells = monthMatrix(monthDate);

  const daysMarkup = cells
    .map((date) => {
      if (!date) {
        return '<span class="calendar-day is-empty" aria-hidden="true"></span>';
      }

      const dateKey = toDateInputValue(date);
      const state = availabilityMap.get(dateKey);
      const isSelected = dateKey === selection.from || dateKey === selection.to;
      const inRange = rangeIncludes(dateKey, selection.from, selection.to);
      const classes = [
        "calendar-day",
        state === "available" ? "is-available" : "",
        state === "booked" ? "is-booked" : "",
        isSelected ? "is-selected" : "",
        !isSelected && inRange ? "is-in-range" : "",
        isPastDate(dateKey) ? "is-past" : ""
      ]
        .filter(Boolean)
        .join(" ");

      return `<button class="${classes}" type="button" data-date="${dateKey}">${date.getDate()}</button>`;
    })
    .join("");

  return `
    <article class="calendar-card">
      <h3 class="calendar-title">${formatShortMonth(monthDate)}</h3>
      <div class="calendar-weekdays">${weekdays.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${daysMarkup}</div>
    </article>
  `;
}

export function openWhatsApp(url) {
  const popup = window.open(url, "_blank", "noopener");
  if (!popup) {
    window.location.href = url;
  }
}

export function buildWhatsAppUrl(phone, message) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function createVideoModalController() {
  const modal = $("#videoModal");
  const video = $("#modalVideo");
  const title = $("#videoModalTitle");

  if (!modal || !video || !title) {
    return {
      open: () => {},
      close: () => {}
    };
  }

  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    video.pause();
    video.removeAttribute("src");
    video.load();
  };

  const open = ({ url, titleText }) => {
    if (!url) {
      showToast("لا يوجد فيديو لهذه الوحدة.");
      return;
    }

    title.textContent = titleText || "معاينة الفيديو";
    video.src = url;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    video.play().catch(() => {});
  };

  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  return { open, close };
}

export function createEmptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

export function setupGalleryDots(track, dotsContainer) {
  if (!track || !dotsContainer) {
    return;
  }

  const slides = $$(".gallery-slide", track);
  dotsContainer.innerHTML = slides
    .map((_, index) => `<button class="gallery-dot ${index === 0 ? "is-active" : ""}" data-index="${index}" type="button"></button>`)
    .join("");

  const updateActiveDot = () => {
    const activeIndex = Math.round(track.scrollLeft / track.clientWidth);
    $$(".gallery-dot", dotsContainer).forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
    });
  };

  track.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateActiveDot);
  });

  dotsContainer.addEventListener("click", (event) => {
    const button = event.target.closest("[data-index]");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);
    track.scrollTo({
      left: track.clientWidth * index,
      behavior: "smooth"
    });
  });
}
