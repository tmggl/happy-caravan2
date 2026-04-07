import { uploadToCloudinary, validateMediaFile } from "./cloudinary.js";
import {
  createUnit,
  deleteUnit,
  firebaseReady,
  listenToAvailability,
  listenToBookingRequests,
  listenToUnits,
  onAdminAuthChange,
  saveAvailabilityRange,
  signInAdmin,
  signOutAdmin,
  updateBookingStatus,
  updateUnit
} from "./firebase.js";
import {
  $,
  $$,
  createEmptyState,
  eachDateInRange,
  formatCurrency,
  formatDisplayDate,
  isValidDateRange,
  saveCache,
  loadCache,
  sanitizeText,
  setElementLoading,
  setStatus,
  clearStatus,
  showToast,
  slugify
} from "./utils.js";

const state = {
  units: [],
  bookings: [],
  editingUnitId: "",
  unitMedia: [],
  videoUrl: "",
  selectedAvailabilityUnitId: "",
  availabilityEntries: [],
  unsubscribeUnits: () => {},
  unsubscribeBookings: () => {},
  unsubscribeAvailability: () => {},
  authUnsubscribe: () => {}
};

document.addEventListener("DOMContentLoaded", () => {
  hydrateCachedLists();
  bindEvents();
  bindAuth();
});

function hydrateCachedLists() {
  const cachedUnits = loadCache("units_cache", []);
  if (cachedUnits.length) {
    state.units = cachedUnits;
    renderUnitsList();
    populateAvailabilitySelect();
    updateStats();
  }
}

function bindEvents() {
  $("#loginForm")?.addEventListener("submit", handleLogin);
  $("#logoutButton")?.addEventListener("click", handleLogout);
  $("#unitForm")?.addEventListener("submit", handleUnitSave);
  $("#resetUnitForm")?.addEventListener("click", resetUnitForm);
  $("#availabilityForm")?.addEventListener("submit", handleAvailabilitySave);
  $("#availabilityUnitSelect")?.addEventListener("change", (event) => {
    state.selectedAvailabilityUnitId = event.target.value;
    subscribeAvailability(state.selectedAvailabilityUnitId);
  });

  // منطق التبويبات
  $$("[data-tab]").forEach((tabButton) => {
    tabButton.addEventListener("click", () => {
      const tabName = tabButton.dataset.tab;
      $$("[data-tab]").forEach((btn) => btn.classList.remove("is-active"));
      $$("[id^='tab']").forEach((panel) => panel.classList.remove("is-active"));
      tabButton.classList.add("is-active");
      const panel = $(`#tab${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}`);
      if (panel) panel.classList.add("is-active");
    });
  });

  $("#existingMediaList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-media]");
    if (!button) {
      return;
    }

    state.unitMedia = state.unitMedia.filter((url) => url !== button.dataset.removeMedia);
    renderMediaPreview();
  });

  $("#existingVideoCard")?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-clear-video]")) {
      return;
    }

    state.videoUrl = "";
    $("#unitVideo").value = "";
    renderMediaPreview();
  });

  $("#adminUnitsList")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-unit]");
    const deleteButton = event.target.closest("[data-delete-unit]");

    if (editButton) {
      const unit = state.units.find((item) => item.id === editButton.dataset.editUnit);
      if (unit) {
        populateUnitForm(unit);
      }
      return;
    }

    if (deleteButton) {
      handleUnitDelete(deleteButton.dataset.deleteUnit);
    }
  });

  $("#bookingRequestsList")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-booking-status]");
    if (!select) {
      return;
    }

    try {
      await updateBookingStatus(select.dataset.bookingStatus, select.value);
      showToast("تم تحديث حالة الطلب.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "تعذر تحديث الحالة.");
    }
  });
}

    if (editButton) {
      const unit = state.units.find((item) => item.id === editButton.dataset.editUnit);
      if (unit) {
        populateUnitForm(unit);
      }
      return;
    }

    if (deleteButton) {
      handleUnitDelete(deleteButton.dataset.deleteUnit);
    }
  });

  $("#bookingRequestsList")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-booking-status]");
    if (!select) {
      return;
    }

    try {
      await updateBookingStatus(select.dataset.bookingStatus, select.value);
      showToast("تم تحديث حالة الطلب.");
    } catch (error) {
      console.error(error);
      showToast(error.message || "تعذر تحديث الحالة.");
    }
  });
}

function bindAuth() {
  if (!firebaseReady()) {
    $("#loginButton").disabled = true;
    const statusEl = $("#loginStatus");
    statusEl.textContent = "تعذر الاتصال بالخدمة. يرجى التواصل مع المطوّر.";
    statusEl.classList.remove("hidden");
    return;
  }

  state.authUnsubscribe = onAdminAuthChange((user) => {
    const loginScreen = $("#loginScreen");
    const dashboardApp = $("#dashboardApp");

    if (user) {
      loginScreen.classList.add("hidden");
      dashboardApp.classList.remove("hidden");
      subscribeDashboardData();
      return;
    }

    loginScreen.classList.remove("hidden");
    dashboardApp.classList.add("hidden");
    teardownDashboardData();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $("#loginButton");

  try {
    setElementLoading(button, true, "جاري تسجيل الدخول...");
    await signInAdmin($("#adminEmail").value, $("#adminPassword").value);
    $("#loginForm").reset();
    showToast("تم تسجيل الدخول بنجاح.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "فشل تسجيل الدخول.");
  } finally {
    setElementLoading(button, false);
  }
}

async function handleLogout() {
  try {
    await signOutAdmin();
    showToast("تم تسجيل الخروج.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "تعذر تسجيل الخروج.");
  }
}

function subscribeDashboardData() {
  teardownDashboardData();

  state.unsubscribeUnits = listenToUnits(
    (units) => {
      state.units = units;
      saveCache("units_cache", units);
      renderUnitsList();
      populateAvailabilitySelect();
      updateStats();
      clearStatus($("#adminStatus"));
    },
    () => {
      showToast("تعذر تحديث قائمة الوحدات.");
    }
  );

  state.unsubscribeBookings = listenToBookingRequests(
    (bookings) => {
      state.bookings = bookings;
      renderBookingRequests();
      updateStats();
    },
    () => {
      showToast("تعذر تحديث طلبات الحجز.");
    }
  );

  if ($("#availabilityUnitSelect").value) {
    subscribeAvailability($("#availabilityUnitSelect").value);
  }
}

function teardownDashboardData() {
  state.unsubscribeUnits();
  state.unsubscribeBookings();
  state.unsubscribeAvailability();
}

async function handleUnitSave(event) {
  event.preventDefault();
  const button = $("#saveUnitButton");
  const uploadStatus = $("#uploadStatus");

  const payload = {
    name: sanitizeText($("#unitName").value),
    description: sanitizeText($("#unitDescription").value),
    price_per_day: Number($("#unitPrice").value),
    location: sanitizeText($("#unitLocation").value),
    show_availability: $("#showAvailability").checked,
    media: [...state.unitMedia],
    video_url: state.videoUrl,
    slug: slugify($("#unitName").value)
  };

  if (payload.name.length < 2 || payload.description.length < 8 || payload.location.length < 2) {
    showToast("أكمل بيانات الوحدة الأساسية أولاً.");
    return;
  }

  if (payload.price_per_day < 0) {
    showToast("السعر اليومي غير صالح.");
    return;
  }

  try {
    setElementLoading(button, true, "جاري الحفظ...");

    const newImageFiles = Array.from($("#unitImages").files || []);
    const videoFile = $("#unitVideo").files?.[0];

    for (const file of newImageFiles) {
      validateMediaFile(file);
      uploadStatus.textContent = `جاري رفع الصورة: ${file.name}`;
      const imageUrl = await uploadToCloudinary(file);
      payload.media.push(imageUrl);
    }

    if (videoFile) {
      validateMediaFile(videoFile);
      uploadStatus.textContent = `جاري رفع الفيديو: ${videoFile.name}`;
      payload.video_url = await uploadToCloudinary(videoFile);
    }

    if (!payload.media.length) {
      showToast("أضف صورة واحدة على الأقل للوحدة.");
      return;
    }

    if (state.editingUnitId) {
      await updateUnit(state.editingUnitId, payload);
      showToast("تم تحديث الوحدة بنجاح.");
    } else {
      await createUnit(payload);
      showToast("تم إنشاء الوحدة بنجاح.");
    }

    uploadStatus.textContent = "تم حفظ الوحدة بنجاح.";
    resetUnitForm();
  } catch (error) {
    console.error(error);
    uploadStatus.textContent = "فشل رفع الوسائط أو حفظ الوحدة.";
    showToast(error.message || "تعذر حفظ الوحدة.");
  } finally {
    setElementLoading(button, false);
  }
}

function populateUnitForm(unit) {
  state.editingUnitId = unit.id;
  state.unitMedia = [...(unit.media || [])];
  state.videoUrl = unit.video_url || "";

  $("#editingUnitId").value = unit.id;
  $("#unitName").value = unit.name || "";
  $("#unitDescription").value = unit.description || "";
  $("#unitPrice").value = unit.price_per_day || "";
  $("#unitLocation").value = unit.location || "";
  $("#showAvailability").checked = Boolean(unit.show_availability);
  $("#uploadStatus").textContent = "يمكنك رفع ملفات إضافية أو حفظ البيانات كما هي.";

  renderMediaPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetUnitForm() {
  $("#unitForm").reset();
  $("#editingUnitId").value = "";
  state.editingUnitId = "";
  state.unitMedia = [];
  state.videoUrl = "";
  $("#uploadStatus").textContent = "لم يتم رفع ملفات جديدة بعد.";
  renderMediaPreview();
}

function renderMediaPreview() {
  const mediaList = $("#existingMediaList");
  const videoCard = $("#existingVideoCard");

  mediaList.innerHTML = state.unitMedia.length
    ? state.unitMedia
        .map(
          (url) => `
            <article class="media-chip">
              <img src="${url}" alt="صورة الوحدة" loading="lazy" />
              <button class="secondary-btn" type="button" data-remove-media="${url}">إزالة</button>
            </article>
          `
        )
        .join("")
    : createEmptyState("لا توجد صور محفوظة حتى الآن.");

  if (state.videoUrl) {
    videoCard.classList.remove("hidden");
    videoCard.innerHTML = `
      <div class="request-head">
        <div>
          <strong>فيديو محفوظ</strong>
          <p class="muted-text">يمكن الإبقاء عليه أو استبداله بملف جديد.</p>
        </div>
        <button class="secondary-btn" type="button" data-clear-video>إزالة الفيديو</button>
      </div>
      <video src="${state.videoUrl}" controls preload="none" playsinline></video>
    `;
  } else {
    videoCard.classList.add("hidden");
    videoCard.innerHTML = "";
  }
}

function renderUnitsList() {
  const list = $("#adminUnitsList");

  if (!state.units.length) {
    list.innerHTML = createEmptyState("لا توجد وحدات بعد. ابدأ بإضافة أول وحدة.");
    return;
  }

  list.innerHTML = state.units
    .map(
      (unit) => `
        <article class="admin-list-row">
          <div class="request-head">
            <div>
              <strong>${unit.name}</strong>
              <p class="muted-text">${unit.location} • ${formatCurrency(unit.price_per_day)}</p>
            </div>
            <span class="chip">${unit.show_availability ? "التوفر ظاهر" : "التوفر مخفي"}</span>
          </div>
          <p class="muted-text">${unit.description}</p>
          <div class="actions-row">
            <button class="secondary-btn" type="button" data-edit-unit="${unit.id}">تعديل</button>
            <button class="primary-btn" type="button" data-delete-unit="${unit.id}">حذف</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function handleUnitDelete(unitId) {
  const unit = state.units.find((item) => item.id === unitId);
  if (!unit || !window.confirm(`هل تريد حذف الوحدة "${unit.name}"؟`)) {
    return;
  }

  try {
    await deleteUnit(unitId);
    showToast("تم حذف الوحدة.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "تعذر حذف الوحدة.");
  }
}

function populateAvailabilitySelect() {
  const select = $("#availabilityUnitSelect");
  const currentValue = select.value;

  select.innerHTML = `
    <option value="">اختر وحدة</option>
    ${state.units.map((unit) => `<option value="${unit.id}">${unit.name}</option>`).join("")}
  `;

  if (state.units.some((unit) => unit.id === currentValue)) {
    select.value = currentValue;
  } else if (!state.selectedAvailabilityUnitId && state.units[0]) {
    select.value = state.units[0].id;
    state.selectedAvailabilityUnitId = state.units[0].id;
    subscribeAvailability(state.selectedAvailabilityUnitId);
  }
}

function subscribeAvailability(unitId) {
  state.unsubscribeAvailability();
  state.availabilityEntries = [];
  renderAvailabilityPreview();

  if (!unitId) {
    return;
  }

  state.selectedAvailabilityUnitId = unitId;
  state.unsubscribeAvailability = listenToAvailability(
    unitId,
    (entries) => {
      state.availabilityEntries = entries;
      renderAvailabilityPreview();
      updateStats();
    },
    () => {
      showToast("تعذر تحديث توفر الوحدة.");
    }
  );
}

async function handleAvailabilitySave(event) {
  event.preventDefault();
  const button = $("#saveAvailabilityButton");
  const unitId = $("#availabilityUnitSelect").value;
  const from = $("#availabilityFrom").value;
  const to = $("#availabilityTo").value;
  const status = $("#availabilityStatusSelect").value;

  if (!unitId) {
    showToast("اختر الوحدة أولاً.");
    return;
  }

  if (!isValidDateRange(from, to)) {
    showToast("فترة التواريخ غير صحيحة.");
    return;
  }

  if (!eachDateInRange(from, to).length) {
    showToast("لم يتم تحديد أي تواريخ.");
    return;
  }

  try {
    setElementLoading(button, true, "جاري حفظ التوفر...");
    await saveAvailabilityRange({ unitId, from, to, status });
    $("#availabilityForm").reset();
    $("#availabilityUnitSelect").value = unitId;
    showToast("تم تحديث التوفر.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "تعذر حفظ التوفر.");
  } finally {
    setElementLoading(button, false);
  }
}

function renderAvailabilityPreview() {
  const preview = $("#availabilityPreview");

  if (!state.selectedAvailabilityUnitId) {
    preview.innerHTML = createEmptyState("اختر وحدة لعرض التوفر.");
    return;
  }

  if (!state.availabilityEntries.length) {
    preview.innerHTML = createEmptyState("لا توجد تواريخ محفوظة لهذه الوحدة بعد.");
    return;
  }

  preview.innerHTML = state.availabilityEntries
    .slice(0, 60)
    .map(
      (entry) => `
        <article class="availability-row">
          <div class="request-head">
            <strong>${formatDisplayDate(entry.date)}</strong>
            <span class="status-badge ${entry.status}">${entry.status === "booked" ? "محجوز" : "متاح"}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderBookingRequests() {
  const list = $("#bookingRequestsList");

  if (!state.bookings.length) {
    list.innerHTML = createEmptyState("لا توجد طلبات حجز حتى الآن.");
    return;
  }

  list.innerHTML = state.bookings
    .map(
      (request) => `
        <article class="booking-request-card">
          <div class="request-head">
            <div>
              <strong>${request.unit_name || "وحدة غير معروفة"}</strong>
              <p class="muted-text">${request.name} • ${request.phone}</p>
            </div>
            <span class="status-badge ${request.status}">${translateBookingStatus(request.status)}</span>
          </div>
          <p class="muted-text">من ${formatDisplayDate(request.date_from)} إلى ${formatDisplayDate(request.date_to)}</p>
          <div class="request-actions">
            <select data-booking-status="${request.id}">
              <option value="pending" ${request.status === "pending" ? "selected" : ""}>معلّق</option>
              <option value="approved" ${request.status === "approved" ? "selected" : ""}>مقبول</option>
              <option value="rejected" ${request.status === "rejected" ? "selected" : ""}>مرفوض</option>
            </select>
          </div>
        </article>
      `
    )
    .join("");
}

function translateBookingStatus(status) {
  if (status === "approved") {
    return "مقبول";
  }

  if (status === "rejected") {
    return "مرفوض";
  }

  return "معلّق";
}

function updateStats() {
  const pending = state.bookings.filter((item) => item.status === "pending").length;
  $("#unitsStat").textContent = state.units.length;
  $("#pendingBookingsStat").textContent = pending;
  $("#availabilityStat").textContent = state.units.filter((unit) => unit.show_availability).length;

  const badge = $("#bookingsBadge");
  if (badge) {
    badge.textContent = pending;
    badge.classList.toggle("hidden", pending === 0);
  }
}
