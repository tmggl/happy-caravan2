// Cloudinary configuration for client-side unsigned uploads.
// ⚠️ IMPORTANT: Never expose API Key or API Secret in frontend code.
// Unsigned uploads require only the cloud name and an unsigned upload preset.
//
// To create an unsigned upload preset:
// 1. Go to https://console.cloudinary.com/settings/upload
// 2. Scroll to "Upload presets" → click "Add upload preset"
// 3. Set "Signing Mode" to "Unsigned"
// 4. Set a folder like "happy-caravan" to organize uploads
// 5. Save, then copy the preset name below.

export const cloudinaryConfig = {
  cloud_name: "djorsdrby",
  upload_preset: "happy_caravan_unsigned"
};
