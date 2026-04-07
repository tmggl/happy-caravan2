import { appConfig } from "../config/firebase-config.js";
import { cloudinaryConfig } from "../config/cloudinary-config.js";

/* ── Allowed MIME types (whitelist for security) ── */
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif"
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime"
];

function assertCloudinaryConfig() {
  const { cloud_name, upload_preset } = cloudinaryConfig;

  if (!cloud_name || !upload_preset || cloud_name.startsWith("YOUR_") || upload_preset.startsWith("YOUR_")) {
    throw new Error("يرجى إعداد Cloudinary في config/cloudinary-config.js أولاً.");
  }
}

function getMaxBytes(file) {
  return file.type.startsWith("video/")
    ? appConfig.maxVideoSizeMB * 1024 * 1024
    : appConfig.maxImageSizeMB * 1024 * 1024;
}

export function validateMediaFile(file) {
  if (!file) {
    throw new Error("لم يتم اختيار ملف.");
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    throw new Error("نوع الملف غير مدعوم. الأنواع المسموحة: JPG, PNG, WebP, MP4, WebM.");
  }

  if (file.size > getMaxBytes(file)) {
    throw new Error(
      isVideo
        ? `حجم الفيديو أكبر من ${appConfig.maxVideoSizeMB} ميجابايت.`
        : `حجم الصورة أكبر من ${appConfig.maxImageSizeMB} ميجابايت.`
    );
  }

  return { kind: isVideo ? "video" : "image" };
}

/**
 * Upload a media file to Cloudinary using an unsigned upload preset.
 * ⚠️ No API Key or Secret is sent from the browser — security relies on
 *    the preset being configured correctly in Cloudinary's dashboard:
 *    - Signing Mode: Unsigned
 *    - Allowed formats: jpg, png, webp, avif, mp4, webm, mov
 *    - Max file size: configured in preset settings
 *    - Folder: happy-caravan
 *
 * @param {File} file — the file chosen by the admin
 * @param {function} [onProgress] — optional (percent) => {} callback
 * @returns {Promise<string>} — the secure HTTPS URL of the uploaded file
 */
export async function uploadToCloudinary(file, onProgress) {
  assertCloudinaryConfig();
  validateMediaFile(file);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloud_name}/auto/upload`;
  const payload = new FormData();
  payload.append("file", file);
  payload.append("upload_preset", cloudinaryConfig.upload_preset);
  payload.append("folder", "happy-caravan");

  /* ── If progress callback provided, use XHR for upload progress ── */
  if (typeof onProgress === "function") {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint);

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
            resolve(data.secure_url);
          } else {
            reject(new Error(data?.error?.message || "فشل رفع الملف. حاول مرة أخرى."));
          }
        } catch {
          reject(new Error("استجابة غير متوقعة من الخادم."));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("خطأ في الاتصال أثناء الرفع.")));
      xhr.addEventListener("abort", () => reject(new Error("تم إلغاء الرفع.")));
      xhr.send(payload);
    });
  }

  /* ── Standard fetch upload ── */
  const response = await fetch(endpoint, {
    method: "POST",
    body: payload
  });

  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "فشل رفع الملف. حاول مرة أخرى.");
  }

  return data.secure_url;
}

/**
 * Build an optimized Cloudinary delivery URL with transformations.
 * Use this to display images/videos on the customer-facing pages
 * with automatic format, quality, and resizing.
 *
 * @param {string} url — the raw secure_url from Cloudinary
 * @param {object} opts — transformation options
 * @returns {string} — optimized URL
 */
export function optimizedUrl(url, { width, height, quality = "auto", format = "auto" } = {}) {
  if (!url || !url.includes("cloudinary.com")) return url;

  const transforms = [`f_${format}`, `q_${quality}`];
  if (width)  transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push("c_fill", "g_auto");

  // Insert transformation after /upload/
  return url.replace("/upload/", `/upload/${transforms.join(",")}/`);
}
