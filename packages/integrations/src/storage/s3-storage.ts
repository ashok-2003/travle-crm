// The storage port on S3, or any S3-compatible server: AWS S3 in the cloud, MinIO locally (spec 9.2).
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ownMessages } from "../jobs/index.js";
import { assertExpiry, assertPositiveSize, assertSafeKey, assertSafePrefix } from "./checks.js";
import { attachmentDisposition } from "./content-disposition.js";
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
 * - `delete` and `deletePrefix` need s3:DeleteObject (DeleteObjects too), which only the console's keys should hold,
 *   and an unversioned bucket, or one whose noncurrent versions expire: a versioned bucket keeps a deleted file
 *   (ADR 0011).
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

    async copy(from, to) {
      assertSafeKey(from);
      assertSafeKey(to);
      try {
        // The source is "bucket/key", URL-encoded a segment at a time; the metadata, its content type included, is
        // copied with it (MetadataDirective COPY, the default). One request copies a file of up to 5 GB.
        const source = `${bucket}/${from.split("/").map(encodeURIComponent).join("/")}`;
        await client.send(new CopyObjectCommand({ Bucket: bucket, Key: to, CopySource: source }));
        return true;
      } catch (error) {
        if (isErrorNamed(error, "NoSuchKey")) return false;
        throw error;
      }
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

    async deletePrefix(prefix) {
      assertSafePrefix(prefix);
      let deleted = 0;
      let token: string | undefined;
      do {
        // A page holds at most 1,000 keys, as many as one DeleteObjects takes: one request per 1,000 files.
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }),
        );
        const objects = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
        if (objects.length > 0) {
          const result = await client.send(
            new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
          );
          // S3 answers 200 even when it kept some: the refused keys come back in Errors.
          const refused = result.Errors ?? [];
          if (refused.length > 0) throw new StorageDeleteError(refused[0]?.Code ?? "Unknown", refused.length);
          deleted += objects.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return deleted;
    },
  };
}

/** Storage refused to delete some files of a prefix. Its message gives the count and S3's code, never a key. */
class StorageDeleteError extends Error {
  static {
    ownMessages(this);
  }

  override readonly name = "StorageDeleteError";

  constructor(
    readonly code: string,
    refused: number,
  ) {
    super(`Storage refused to delete ${String(refused)} files (${code})`);
  }
}

/**
 * Only the error that means "no such key" counts as missing: a missing bucket (NoSuchBucket) must stay an error.
 * S3 sends no body on a HEAD 404, so `head` can't tell a missing bucket from a missing key (both are NotFound); call
 * `checkBucket` at start-up to catch a wrong bucket name.
 */
function isErrorNamed(error: unknown, name: string): boolean {
  return error instanceof S3ServiceException && error.name === name;
}
