// The storage port on S3, or any S3-compatible server: AWS S3 in the cloud, MinIO locally (spec 9.2).
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

/** The headers a presigned upload signs, so storage refuses a file of another size or type. */
const SIGNED_UPLOAD_HEADERS = new Set(["content-type", "content-length"]);

export function createS3Storage(settings: S3StorageSettings): ObjectStorage {
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
    async presignUpload({ key, contentType, sizeBytes }, expiresInSeconds) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: SIGNED_UPLOAD_HEADERS,
      });
      return {
        url,
        method: "PUT",
        headers: { "content-type": contentType, "content-length": String(sizeBytes) },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      };
    },

    async presignDownload({ key, fileName }, expiresInSeconds) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: attachmentDisposition(fileName),
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    async put({ key, contentType, body }) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, Body: body }));
    },

    async head(key) {
      try {
        const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: object.ContentLength ?? 0, contentType: object.ContentType ?? null };
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },

    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
  };
}

/** S3 answers 404 (NotFound, NoSuchKey) for a key with nothing stored. */
function isMissing(error: unknown): boolean {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404;
}

/**
 * `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): browsers use the UTF-8 name, so Hindi names and quotes
 * survive; the plain name is an ASCII fallback with anything risky replaced, so it can't break out of its quotes.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
