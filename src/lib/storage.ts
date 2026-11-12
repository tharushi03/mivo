// Local image storage. Files live in ./uploads (outside public/, because Next.js
// only serves public/ files that existed at build time) and are served by
// src/app/uploads/[file]/route.ts at /uploads/<name>.
// Swap this module for Cloudflare R2 / S3 later; callers only use these functions.
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// turbopackIgnore: this path is only known at runtime; don't trace the project into the build.
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type ImageExt = "jpg" | "png" | "webp";
export const IMAGE_MIME: Record<ImageExt, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Valid stored filenames: <uuid>.<ext>. Anything else is rejected (no path traversal).
export const STORED_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Detect the real image type from the file's first bytes (don't trust the browser's MIME). */
export function detectImageType(buf: Buffer): ImageExt | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  return null;
}

/** Saves the image and returns its public URL, e.g. "/uploads/<uuid>.jpg". */
export async function saveImage(buf: Buffer, ext: ImageExt): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

export async function deleteImage(url: string) {
  const name = url.replace(/^\/uploads\//, "");
  if (!STORED_NAME.test(name)) return;
  await unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name)).catch(() => {});
}

// ---- Private files (e.g. bank slips) ----
// Stored in <UPLOAD_DIR>/private/<folder>/, which the public /uploads route can never
// reach (it only serves bare <uuid>.<ext> names). Served only through auth-checked routes.
export type PrivateFolder = "slips";
const PRIVATE_KEY = /^(slips)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const privatePath = (key: string) => path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, "private", key);

/** Saves a private image and returns its storage key, e.g. "slips/<uuid>.jpg". */
export async function savePrivateImage(folder: PrivateFolder, buf: Buffer, ext: ImageExt): Promise<string> {
  const key = `${folder}/${randomUUID()}.${ext}`;
  await mkdir(path.dirname(privatePath(key)), { recursive: true });
  await writeFile(privatePath(key), buf);
  return key;
}

export async function readPrivateImage(key: string) {
  if (!PRIVATE_KEY.test(key)) return null;
  try {
    const data = await readFile(privatePath(key));
    return { data, mime: IMAGE_MIME[key.split(".").pop() as ImageExt] };
  } catch {
    return null;
  }
}

export async function deletePrivateImage(key: string) {
  if (!PRIVATE_KEY.test(key)) return;
  await unlink(privatePath(key)).catch(() => {});
}

export async function readImage(name: string) {
  if (!STORED_NAME.test(name)) return null;
  try {
    const data = await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name));
    return { data, mime: IMAGE_MIME[name.split(".").pop() as ImageExt] };
  } catch {
    return null;
  }
}
