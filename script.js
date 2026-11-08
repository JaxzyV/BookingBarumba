// === KONFIGURASI SCRIPT ===
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxZz_rkAy4pbNUrV73EoSVLA8CdoLwZ_rTcTRCDu8LCpDzG_UW_6oVc5rsMtrL0znHQ/exec";

let configSettings = {
  hargaSiang: 90000,
  hargaMalam: 120000,
  jamBukaSiang: 7,
  jamTutupSiang: 18,
  jamBukaMalam: 18,
  jamTutupMalam: 23,
  adminWaNumber: "6285331885155", // Default fallback jika belum termuat
};

let existingBookings = [];

// Set Minimal Tanggal Input = Hari ini
const todayStr = getTodayISO();
const inputTanggal = document.getElementById("tanggal");
inputTanggal.min = todayStr;
inputTanggal.value = todayStr;

window.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  const progressBar = document.getElementById("progress-bar");
  if (progressBar) progressBar.style.width = "50%";

  try {
    const response = await fetch(APPS_SCRIPT_URL);
    const result = await response.json();

    if (progressBar) progressBar.style.width = "100%";

    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";

      if (result.status === "success") {
        if (result.settings) {
          configSettings = result.settings;
        }

        if (configSettings.isClosed) {
          document.getElementById("closed-screen").classList.remove("hidden");
          document.getElementById("booking-form").classList.add("hidden");
        } else {
          existingBookings = result.bookings || [];
          updateJamOptions();
          updateFormLogic();
        }
      } else {
        showModal(
          "Gagal Memuat Data",
          result.message || "Terjadi kesalahan pada server.",
        );
      }
    }, 400);
  } catch (err) {
    console.error("Error init:", err);
    showModal(
      "Koneksi Terputus",
      "Gagal terhubung ke server Google Sheets. Silakan muat ulang halaman.",
    );
  }
}

// Event Listeners Input Form
document.getElementById("kategori").addEventListener("change", () => {
  updateJamOptions();
  updateFormLogic();
});
document.getElementById("jamMulai").addEventListener("change", updateFormLogic);
document.getElementById("durasi").addEventListener("change", updateFormLogic);
document.getElementById("tanggal").addEventListener("change", () => {
  validateDateInput();
  updateFormLogic();
});

function validateDateInput() {
  const selectedDate = inputTanggal.value;
  if (selectedDate < todayStr) {
    showModal(
      "Tanggal Tidak Valid",
      "Anda tidak dapat memilih tanggal yang sudah berlalu.",
    );
    inputTanggal.value = todayStr;
  }
}

function updateJamOptions() {
  const kategori = document.getElementById("kategori").value;
  const jamMulaiSelect = document.getElementById("jamMulai");
  jamMulaiSelect.innerHTML = "";

  let startHour =
    kategori === "siang"
      ? configSettings.jamBukaSiang
      : configSettings.jamBukaMalam;
  let endHour =
    kategori === "siang"
      ? configSettings.jamTutupSiang
      : configSettings.jamTutupMalam;

  for (let h = startHour; h < endHour; h++) {
    let jamStr = (h < 10 ? "0" + h : h) + ":00";
    let option = document.createElement("option");
    option.value = jamStr;
    option.textContent = jamStr;
    jamMulaiSelect.appendChild(option);
  }
}

function updateFormLogic() {
  const jamMulai = document.getElementById("jamMulai").value;
  const durasi = parseInt(document.getElementById("durasi").value) || 1;
  const kategori = document.getElementById("kategori").value;
  const selectedDate = document.getElementById("tanggal").value;

  if (!jamMulai) return;

  // 1. Hitung Jam Selesai
  let startH = parseInt(jamMulai.split(":")[0]);
  let endH = startH + durasi;
  let jamSelesaiStr = (endH < 10 ? "0" + endH : endH) + ":00";
  document.getElementById("jamSelesai").value = jamSelesaiStr;

  // 2. Hitung Total Harga Dinamis dari Settings
  let rate =
    kategori === "siang"
      ? configSettings.hargaSiang
      : configSettings.hargaMalam;
  let total = rate * durasi;
  document.getElementById("totalHarga").textContent =
    "Rp " + total.toLocaleString("id-ID");

  // 3. Render Preview Jadwal & Check Overlap
  renderSchedulePreview(selectedDate, startH, endH);
}

function renderSchedulePreview(selectedDate, currentStartH, currentEndH) {
  const previewContainer = document.getElementById("preview-schedule");
  previewContainer.innerHTML = "";

  // Filter booking berdasarkan tanggal ISO
  const dayBookings = existingBookings.filter(
    (b) => b.tanggal === selectedDate,
  );
  let isConflict = false;

  if (dayBookings.length === 0) {
    previewContainer.innerHTML =
      '<div class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium text-center">Belum ada bookingan pada tanggal ini.</div>';
  } else {
    dayBookings.forEach((b) => {
      let div = document.createElement("div");
      div.className =
        "p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex justify-between items-center font-semibold";
      div.innerHTML = `<span>Jam ${b.jamMulai} - ${b.jamSelesai}</span> <span class="bg-red-200/60 px-2 py-0.5 rounded text-[10px]">Telah Dibooking</span>`;
      previewContainer.appendChild(div);

      // Cek Overlap Jam
      let bStart = parseInt(b.jamMulai.split(":")[0]);
      let bEnd = parseInt(b.jamSelesai.split(":")[0]);

      if (Math.max(currentStartH, bStart) < Math.min(currentEndH, bEnd)) {
        isConflict = true;
      }
    });
  }

  // Update State Tombol Kirim
  const btnSubmit = document.getElementById("btn-submit");
  const btnText = document.getElementById("btn-text");

  if (isConflict) {
    btnSubmit.disabled = true;
    btnText.textContent = "Jam Dipilih Sudah Terbooking!";
  } else {
    btnSubmit.disabled = false;
    btnText.textContent = "Kirim Booking via WhatsApp";
  }
}

// Form Submit Handler
document
  .getElementById("booking-form")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const btnSubmit = document.getElementById("btn-submit");
    const btnText = document.getElementById("btn-text");
    const btnProgress = document.getElementById("btn-progress");

    // Format Payload Data
    const payload = {
      nama: document.getElementById("nama").value.trim(),
      tanggal: document.getElementById("tanggal").value,
      kategori: document.getElementById("kategori").value,
      jamMulai: document.getElementById("jamMulai").value,
      jamSelesai: document.getElementById("jamSelesai").value,
      durasi: document.getElementById("durasi").value,
      totalHarga: document.getElementById("totalHarga").textContent,
      catatan: document.getElementById("catatan").value.trim(),
    };

    // Validasi Tambahan Sebelum Kirim
    if (payload.tanggal < todayStr) {
      showModal("Peringatan", "Tanggal booking tidak boleh masa lalu.");
      return;
    }

    // Set State Loading Tombol Kirim
    btnSubmit.disabled = true;
    btnText.textContent = "Menyimpan Booking...";
    btnProgress.classList.remove("hidden");

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.status === "success") {
        const waText =
          `Halo Admin Barumba, saya ingin mengonfirmasi booking:%0A%0A` +
          `*ID Booking:* ${data.bookingId}%0A` +
          `*Nama:* ${payload.nama}%0A` +
          `*Tanggal:* ${payload.tanggal}%0A` +
          `*Kategori:* ${payload.kategori.toUpperCase()}%0A` +
          `*Waktu:* ${payload.jamMulai} - ${payload.jamSelesai} (${payload.durasi} Jam)%0A` +
          `*Total Biaya:* ${payload.totalHarga}%0A` +
          `*Catatan:* ${payload.catatan || "-"}`;

        // Mengambil nomor WhatsApp secara dinamis dari konfigurasi server (Sheet Settings)
        const targetWaNumber = configSettings.adminWaNumber || "6285331885155";
        window.location.href = `https://wa.me/${targetWaNumber}?text=${waText}`;
      } else {
        showModal("Gagal Memproses", data.message || "Terjadi kesalahan.");
        resetSubmitBtn();
      }
    } catch (err) {
      console.error("Submit Error:", err);
      showModal("Kesalahan Koneksi", "Gagal menghubungkan ke server.");
      resetSubmitBtn();
    }
  });

function resetSubmitBtn() {
  const btnSubmit = document.getElementById("btn-submit");
  const btnText = document.getElementById("btn-text");
  const btnProgress = document.getElementById("btn-progress");

  btnSubmit.disabled = false;
  btnText.textContent = "Kirim Booking via WhatsApp";
  btnProgress.classList.add("hidden");
}

function showModal(title, message) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;
  document.getElementById("modal-alert").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-alert").classList.add("hidden");
}

function getTodayISO() {
  const d = new Date();
  let month = "" + (d.getMonth() + 1);
  let day = "" + d.getDate();
  let year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return [year, month, day].join("-");
}
