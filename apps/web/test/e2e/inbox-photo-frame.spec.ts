// Photos in a bubble sit in a fixed frame (inbox part 2, item 14): on a phone a wide photo and a tall one take the same box before
// and after they load or fail, and neither the page nor any bubble grows wider than the screen. The pictures are held back, then released.
import { deflateSync } from "node:zlib";
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { connectNumber, customerMessage, deliverWhatsapp, newCustomerNumber, openNewChat } from "./support/whatsapp";

test.use({ actionTimeout: 20_000 });

/** A plain grey PNG of the given size, made here so the test needs no files. */
function png(width: number, height: number): Buffer {
  const crc = (buffer: Buffer) => {
    let value = ~0;
    for (const byte of buffer) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return ~value >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let row = 0; row < height; row += 1) rows[row * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const cases = [
  { viewport: { width: 320, height: 640 }, outcome: "load" },
  { viewport: { width: 390, height: 844 }, outcome: "load" },
  { viewport: { width: 320, height: 640 }, outcome: "fail" },
] as const;

for (const { viewport, outcome } of cases) {
  test(`a wide and a tall photo keep their frame and the screen's width when they ${outcome} at ${String(viewport.width)}px`, async ({
    page,
    browser,
    superAdmin,
    agency,
  }) => {
    test.setTimeout(420_000);
    const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
    if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");
    await signInToConsole(page, superAdmin);
    const business = await connectNumber(page, agency.organizationId);
    const owner = await browser.newPage({ viewport });
    await signInByEmail(owner, agency.owner);
    const customer = newCustomerNumber();
    const chat = await openNewChat(owner, business, customer, "Meera Rao", "Here are the photos");

    // Every stored picture (a presigned storage link) is held until released, then answered or refused.
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const wide = png(2000, 600);
    const tall = png(1000, 3000);
    let served = 0;
    await owner.route(
      (url) => url.searchParams.has("X-Amz-Signature"),
      async (route) => {
        if (route.request().resourceType() !== "image") return route.continue();
        const body = served % 2 === 0 ? wide : tall;
        served += 1;
        await released;
        if (outcome === "fail") return route.abort();
        return route.fulfill({ status: 200, contentType: "image/png", body });
      },
    );
    for (const caption of ["Wide", "Tall"]) {
      expect(
        await deliverWhatsapp([
          customerMessage({ to: business, customerNumber: customer, contentType: "image", url: photoUrl, caption }),
        ]),
      ).toBe(200);
    }
    await expect(chat.getByRole("button", { name: "Open the photo" })).toHaveCount(2, { timeout: 90_000 });

    // The frames are the photos' boxes, whether they hold a picture or the words for a failure.
    const frames = chat.locator(String.raw`.aspect-\[4\/5\]`);
    const sizes = () =>
      frames.evaluateAll((all) =>
        all.map((frame) => {
          const { width, height } = frame.getBoundingClientRect();
          return [width, height];
        }),
      );
    const fits = async () =>
      (await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)) &&
      (await chat.evaluate((root) =>
        [...root.querySelectorAll("*")].every((element) => element.getBoundingClientRect().right <= window.innerWidth),
      ));
    const before = await sizes();
    expect(before).toHaveLength(2);
    expect(await fits()).toBe(true);

    release();
    if (outcome === "fail") await expect(chat.getByText("Photo not available")).toHaveCount(2);
    else {
      await expect
        .poll(() =>
          owner.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)),
        )
        .toBe(true);
    }
    expect(await sizes()).toEqual(before);
    expect(await fits()).toBe(true);
    await owner.close();
  });
}
