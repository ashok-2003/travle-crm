// The smallest valid logos, for rendering tests: a 1x1 transparent PNG and a 1x1 grey JPEG.

const bytesOf = (base64: string) => Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export const tinyPng = bytesOf(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
);

export const tinyJpeg = bytesOf(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////" +
    "////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
);
