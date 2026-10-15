// The storage port on S3, or any S3-compatible server: AWS S3 in the cloud, MinIO locally (spec 9.2).
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertExpiry, assertPositiveSize, assertSafeKey } from "./checks.js";
import type { ObjectStorage } from "./object-storage.js";

export interface S3StorageSettings {
  /** Leave out for AWS S3. A local MinIO's address, e.g. http://localhost:59000. */
  endpoint?: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Puts the bucket in the path instead of the host name, as MinIO needs. */
  forcePathStyle?: boolean | undefined;
}

/**
 * The headers a presigned upload signs, so storage refuses a file of another size or type, or one that would replace
 * a file already stored.
 */
const SIGNED_UPLOAD_HEADERS = new Set(["content-type", "content-length", "if-none-match"]);

/** The S3 adapter, with a start-up check the port doesn't have. */
export interface S3Storage extends ObjectStorage {
  /** Throws a clear error, naming the bucket, unless the bucket exists and the credentials can reach it. */
  checkBucket(): Promise<void>;
}

/**
 * Notes for whoever deploys this:
 * - Static access keys are required for now (no instance or task roles).
 * - The bucket must have ACLs disabled (Bucket owner enforced): unsigned x-amz-acl headers could otherwise ride on
 *   a presigned PUT.
 * - `head` on a missing key needs s3:ListBucket, or S3 answers 403 instead of 404.
 */
export function createS3Storage(settings: S3StorageSettings): S3Storage {
  const config: S3ClientConfig = {
    region: settings.region,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    forcePathStyle: settings.forcePathStyle ?? false,
    // By default the SDK adds a checksum of the (empty) body to presigned uploads, and S3 then refuses the real one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  if (settings.endpoint !== undefined) config.endpoint = settings.endpoint;
  const client = new S3Client(config);
  const bucket = settings.bucket;

  return {
    async checkBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        const reason =
          error instanceof S3ServiceException
            ? `${error.name} (${String(error.$metadata.httpStatusCode)})`
            : "unreachable";
        throw new Error(`The storage bucket "${bucket}" can't be used: ${reason}`, { cause: error });
      }
    },

    async presignUpload({ key, contentType, sizeBytes }, expiresInSeconds) {
      assertSafeKey(key);
      assertPositiveSize(sizeBytes);
      assertExpiry(expiresInSeconds);
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
        IfNoneMatch: "*",
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: SIGNED_UPLOAD_HEADERS,
      });
      return {
        url,
        method: "PUT",
        headers: { "content-type": contentType, "content-length": String(sizeBytes), "if-none-match": "*" },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
    },

    async presignDownload({ key, fileName }, expiresInSeconds) {
      assertSafeKey(key);
      assertExpiry(expiresInSeconds);
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: attachmentDisposition(fileName),
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    async put({ key, contentType, body }) {
      assertSafeKey(key);
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, Body: body }));
    },

    async head(key) {
      assertSafeKey(key);
      try {
        const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: object.ContentLength ?? 0, contentType: object.ContentType ?? null };
      } catch (error) {
        if (isErrorNamed(error, "NotFound")) return null;
        throw error;
      }
    },

    async get(key) {
      assertSafeKey(key);
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (isErrorNamed(error, "NoSuchKey")) return null;
        throw error;
      }
    },

    async delete(key) {
      assertSafeKey(key);
      // S3 answers success for a key with nothing stored, so deleting is safe to repeat.
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/**
 * Only the error that means "no such key" counts as missing: a missing bucket (NoSuchBucket) must stay an error.
 * S3 sends no body on a HEAD 404, so `head` can't tell a missing bucket from a missing key (both are NotFound); call
 * `checkBucket` at start-up to catch a wrong bucket name.
 */
function isErrorNamed(error: unknown, name: string): boolean {
  return error instanceof S3ServiceException && error.name === name;
}

/**
 * `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): browsers use the UTF-8 name, so Hindi names and quotes
 * survive; the plain name is an ASCII fallback with anything risky replaced, so it can't break out of its quotes.
 */
export function attachmentDisposition(fileName: string): string {
  // A lone surrogate would make encodeURIComponent throw: it becomes U+FFFD, and "_" in the ASCII fallback.
  const wellFormed = fileName.toWellFormed();
  const fallback = wellFormed.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(wellFormed).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
