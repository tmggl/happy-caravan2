import { appConfig } from "../config/firebase-config.js";
import {
  createBookingRequest,
  firebaseReady,
  listenToAvailability,
  listenToUnit,
  listenToUnits
} from "./firebase.js";
import {
  $,
  $$,
  addMonths,
  buildCalendarMonth,
  buildWhatsAppUrl,
  clearStatus,
  createEmptyState,
  createVideoModalController,
  eachDateInRange,
  formatCurrency,
  formatDisplayDate,
  getQueryParam,
  isPastDate,
  isValidDateRange,
  isValidPhone,
  loadCache,
  openWhatsApp,
  sanitizePhone,
  sanitizeText,
  saveCache,
  setElementLoading,
  setStatus,
  setupGalleryDots,
  showToast
} from "./utils.js";

const page = document.body.dataset.page;
const videoModal = createVideoModalController();

const state = {
  units: [],
  unit: null,
  availabilityMap: new Map(),
  selection: {
    from: "",
    to: ""
  }
};

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("is-ready");
  });

  initAutoReveal();

  if (page === "home") {
    initHomePage();
  }

  if (page === "unit") {
    initUnitPage();
  }
});

function initAutoReveal(scope = document) {
  const targets = $$(
    ".hero-banner, .section-block, .detail-summary, .video-preview-card, .calendar-card, .booking-panel",
    scope
  );

  if (!targets.length) {
    return;
  }

  targets.forEach((el, index) => {
    el.classList.add("auto-reveal");
    el.style.setProperty("--reveal-order", String(index % 6));
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  targets.forEach((el) => observer.observe(el));
}

function initHomePage() {
  const grid = $("#unitsGrid");
  const status = $("#homeStatus");

  initHeroBanner();

  const cachedUnits = loadCache("units_cache", []);
  if (cachedUnits.length) {
    state.units = cachedUnits;
    renderHomeUnits(cachedUnits);
  }

  if (!firebaseReady()) {
    if (!cachedUnits.length) {
      grid.innerHTML = createEmptyState("لا توجد وحدات متاحة حالياً.");
    }
  }

  if (!firebaseReady()) {
    return;
  }

  listenToUnits(
    (units) => {
      state.units = units;
      saveCache("units_cache", units);
      clearStatus(status);
      renderHomeUnits(units);
    },
    () => {
      setStatus(status, "تعذر تحديث الوحدات لحظيًا. يتم عرض آخر نسخة محفوظة.", true);
      renderHomeUnits(state.units);
    }
  );
}

function initHeroBanner() {
  const hero = $(".hero-banner");
  const mainImage = $(".hero-gallery-main img");
  const thumbs = $$(".hero-gallery-sub img");

  if (!hero || !mainImage || !thumbs.length) {
    return;
  }

  const markFirstActive = () => {
    thumbs.forEach((thumb, index) => thumb.classList.toggle("is-active", index === 0));
  };

  const swapWithThumb = (thumb) => {
    const oldMainSrc = mainImage.src;
    const oldMainAlt = mainImage.alt;

    mainImage.src = thumb.src;
    mainImage.alt = thumb.alt;

    thumb.src = oldMainSrc;
    thumb.alt = oldMainAlt;

    thumbs.forEach((item) => item.classList.remove("is-active"));
    thumb.classList.add("is-active");
  };

  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      swapWithThumb(thumb);
    });
  });

  markFirstActive();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  let autoIndex = 0;
  let timer = null;

  const startAutoPlay = () => {
    stopAutoPlay();
    timer = window.setInterval(() => {
      if (!thumbs.length) {
        return;
      }

      autoIndex = (autoIndex + 1) % thumbs.length;
      swapWithThumb(thumbs[autoIndex]);
    }, 4800);
  };

  const stopAutoPlay = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  hero.addEventListener("mouseenter", stopAutoPlay);
  hero.addEventListener("mouseleave", startAutoPlay);
  hero.addEventListener("touchstart", stopAutoPlay, { passive: true });
  hero.addEventListener("touchend", startAutoPlay);

  startAutoPlay();
}

function renderHomeUnits(units) {
  const grid = $("#unitsGrid");
  const count = $("#unitCount");

  count.textContent = `${units.length} وحدة`;

  if (!units.length) {
    grid.innerHTML = createEmptyState("لا توجد وحدات متاحة حالياً — عد قريباً 🌿");
    return;
  }

  grid.innerHTML = units
    .map((unit, index) => {
      const cover = unit.media?.[0] || "";
      return `
        <article class="unit-card is-entering" style="--index:${index}">
          <div class="unit-card-media">
            ${
              cover
                ? `<img src="${cover}" alt="${unit.name}" loading="lazy" />`
                : `<div class="unit-card-media"></div>`
            }
            <span class="pill unit-card-badge">${formatCurrency(unit.price_per_day)}</span>
          </div>
          <div class="unit-card-body">
            <div class="unit-card-head">
              <div>
                <h3>${unit.name || "وحدة بدون اسم"}</h3>
                <p class="unit-subtitle">${unit.location || "الموقع غير محدد"}</p>
              </div>
            </div>
            <p class="muted-text">${truncateText(unit.description, 110)}</p>
            <div class="unit-actions">
              <a class="secondary-btn full-width" href="unit.html?id=${unit.id}">عرض التفاصيل</a>
              <button class="primary-btn full-width" type="button" data-open-video="${unit.id}" ${
                unit.video_url ? "" : "disabled"
              }>
                🎥 شاهد الفيديو
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    $$(".unit-card.is-entering", grid).forEach((card) => {
      card.classList.add("is-visible");
    });
  });

  initAutoReveal(grid);

  $$("[data-open-video]").forEach((button) => {
    button.addEventListener("click", () => {
      const unit = state.units.find((item) => item.id === button.dataset.openVideo);
      if (!unit) {
        return;
      }

      videoModal.open({
        url: unit.video_url,
        titleText: unit.name
      });
    });
  });
}

function truncateText(value = "", maxLength = 120) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

function initUnitPage() {
  const unitId = getQueryParam("id");
  const detailStatus = $("#unitDetailStatus");
  const content = $("#unitContent");

  if (!unitId) {
    setStatus(detailStatus, "معرّف الوحدة غير موجود في الرابط.", true);
    return;
  }

  const cachedUnits = loadCache("units_cache", []);
  const cachedUnit = cachedUnits.find((unit) => unit.id === unitId);
  if (cachedUnit) {
    state.unit = cachedUnit;
    renderUnitDetails(cachedUnit);
    detailStatus.classList.add("hidden");
    content.classList.remove("hidden");
  }

  const cachedAvailability = loadCache(`availability_${unitId}`, []);
  if (cachedAvailability.length) {
    applyAvailabilityEntries(cachedAvailability);
    renderAvailability();
  }

  if (!firebaseReady() && !cachedUnit) {
    setStatus(detailStatus, "تعذر تحميل بيانات الوحدة حالياً. حاول مرة أخرى.", true);
  }

  bindBookingForm();

  if (!firebaseReady()) {
    return;
  }

  listenToUnit(
    unitId,
    (unit) => {
      if (!unit) {
        setStatus(detailStatus, "عذراً، لم نجد هذه الوحدة. قد تكون أُزيلت أو الرابط غير صحيح.", true);
        content.classList.add("hidden");
        return;
      }

      state.unit = unit;
      renderUnitDetails(unit);
      detailStatus.classList.add("hidden");
      content.classList.remove("hidden");
    },
    () => {
      setStatus(detailStatus, "تعذر تحميل تفاصيل الوحدة لحظيًا. يتم عرض النسخة المتوفرة.", true);
    }
  );

  listenToAvailability(
    unitId,
    (entries) => {
      applyAvailabilityEntries(entries);
      saveCache(`availability_${unitId}`, entries);
      renderAvailability();
    },
    () => {
      showToast("تعذر تحديث التقويم لحظيًا.");
    }
  );
}

function renderUnitDetails(unit) {
  $("#unitTitle").textContent = unit.name || "تفاصيل الوحدة";
  $("#detailName").textContent = unit.name || "--";
  $("#detailLocation").textContent = unit.location || "--";
  $("#detailDescription").textContent = unit.description || "--";
  $("#unitPrice").textContent = formatCurrency(unit.price_per_day);

  const galleryTrack = $("#galleryTrack");
  const galleryDots = $("#galleryDots");
  const media = unit.media?.length ? unit.media : [""];

  galleryTrack.innerHTML = media
    .map(
      (imageUrl, index) => `
        <div class="gallery-slide">
          ${
            imageUrl
              ? `<img src="${imageUrl}" alt="${unit.name} - صورة ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" />`
              : `<div class="gallery-slide"></div>`
          }
        </div>
      `
    )
    .join("");

  setupGalleryDots(galleryTrack, galleryDots);

  const detailVideoButton = $("#detailVideoButton");
  const previewCard = $("#videoPreviewCard");
  const hasVideo = Boolean(unit.video_url);

  detailVideoButton.disabled = !hasVideo;
  detailVideoButton.onclick = () => {
    videoModal.open({
      url: unit.video_url,
      titleText: unit.name
    });
  };

  previewCard.innerHTML = hasVideo
    ? `
      <div class="video-preview-inner">
        <div class="video-preview-thumb">
          <video src="${unit.video_url}" preload="none" playsinline controls></video>
        </div>
        <button class="primary-btn full-width" type="button" id="inlineVideoOpen">🎥 شاهد الفيديو بملء الشاشة</button>
      </div>
    `
    : createEmptyState("لا يوجد فيديو لهذه الوحدة حالياً — سيُضاف قريباً.");

  $("#inlineVideoOpen")?.addEventListener("click", () => {
    videoModal.open({
      url: unit.video_url,
      titleText: unit.name
    });
  });

  initAutoReveal($("#unitContent"));

  const availabilitySection = $("#availabilitySection");
  availabilitySection.classList.toggle("hidden", !unit.show_availability);
  renderAvailability();
}

function applyAvailabilityEntries(entries) {
  state.availabilityMap = new Map(entries.map((entry) => [entry.date, entry.status]));
}

function renderAvailability() {
  const section = $("#availabilitySection");
  const container = $("#calendarContainer");

  if (!state.unit?.show_availability) {
    return;
  }

  const currentMonth = new Date();
  currentMonth.setDate(1);

  container.innerHTML = [0, 1]
    .map((offset) => buildCalendarMonth(addMonths(currentMonth, offset), state.availabilityMap, state.selection))
    .join("");

  $$(".calendar-day[data-date]", container).forEach((button) => {
    button.addEventListener("click", () => {
      const { date } = button.dataset;
      if (!date || state.availabilityMap.get(date) === "booked" || isPastDate(date)) {
        return;
      }

      applyDateSelection(date);
      renderAvailability();
      syncDateInputs();
    });
  });

  section.classList.remove("hidden");
}

function applyDateSelection(date) {
  const { from, to } = state.selection;

  if (!from || (from && to)) {
    state.selection = { from: date, to: "" };
    updateSelectionSummary();
    return;
  }

  if (date < from) {
    state.selection = { from: date, to: from };
  } else {
    state.selection = { from, to: date };
  }

  updateSelectionSummary();
}

function syncDateInputs() {
  $("#dateFrom").value = state.selection.from;
  $("#dateTo").value = state.selection.to;
}

function updateSelectionSummary() {
  const summary = $("#bookingSelectionSummary");
  const { from, to } = state.selection;

  if (!from && !to) {
    summary.textContent = "اختر التواريخ من الحقول أو بالضغط على التقويم.";
    return;
  }

  if (from && !to) {
    summary.textContent = `تم اختيار تاريخ الوصول: ${formatDisplayDate(from)}. اختر تاريخ المغادرة.`;
    return;
  }

  summary.textContent = `الفترة المختارة: ${formatDisplayDate(from)} إلى ${formatDisplayDate(to)}.`;
}

function bindBookingForm() {
  const form = $("#bookingForm");
  const dateFrom = $("#dateFrom");
  const dateTo = $("#dateTo");

  dateFrom?.addEventListener("change", () => {
    state.selection.from = dateFrom.value;
    state.selection.to = dateTo.value;
    updateSelectionSummary();
    renderAvailability();
  });

  dateTo?.addEventListener("change", () => {
    state.selection.from = dateFrom.value;
    state.selection.to = dateTo.value;
    updateSelectionSummary();
    renderAvailability();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.unit) {
      showToast("لا يمكن إرسال الحجز قبل تحميل الوحدة.", "error");
      return;
    }

    const button = $("#whatsAppBookingButton");
    const name = sanitizeText($("#guestName").value);
    const phone = sanitizePhone($("#guestPhone").value);
    const from = $("#dateFrom").value;
    const to = $("#dateTo").value;

    if (name.length < 2) {
      showToast("يرجى إدخال اسم واضح.");
      return;
    }

    if (!isValidPhone(phone)) {
      showToast("رقم الجوال غير صحيح.");
      return;
    }

    if (!isValidDateRange(from, to)) {
      showToast("يرجى اختيار فترة حجز صحيحة.");
      return;
    }

    const selectedDates = eachDateInRange(from, to);
    const hasBookedDates = selectedDates.some((date) => state.availabilityMap.get(date) === "booked");
    if (hasBookedDates) {
      showToast("الفترة تحتوي على أيام محجوزة. اختر فترة أخرى.");
      return;
    }

    const message = `مرحباً، أرغب بحجز وحدة "${state.unit.name}" في أبها\nمن: ${formatDisplayDate(from)}\nإلى: ${formatDisplayDate(to)}\nالاسم: ${name}\nالجوال: ${phone}`;

    try {
      setElementLoading(button, true, "جاري تجهيز الطلب...");

      if (firebaseReady()) {
        await createBookingRequest({
          unit_id: state.unit.id,
          unit_name: state.unit.name,
          name,
          phone,
          date_from: from,
          date_to: to,
          status: "pending"
        });
      }

      openWhatsApp(buildWhatsAppUrl(appConfig.whatsappPhone, message));
      showToast("تم تجهيز الطلب وفتح واتساب.");
      form.reset();
      state.selection = { from: "", to: "" };
      updateSelectionSummary();
      renderAvailability();
    } catch (error) {
      console.error(error);
      showToast(error.message || "تعذر إنشاء طلب الحجز.");
    } finally {
      setElementLoading(button, false);
    }
  });

  updateSelectionSummary();
}
