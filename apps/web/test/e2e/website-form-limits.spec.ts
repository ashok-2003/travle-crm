// The limits and the visitor's address (spec 13, journeys 6 and 7), as requests straight to the api with the headers a proxy
// would add: the harness reads one hop (PUBLIC_FORM_PROXY_HOPS=1), so the visitor is the second entry from the right and
// anything to the left of it is whatever they sent. A browser comes through the web app's rewrite, which leaves the api no
// address to read, so only the agency's limit applies to it.
import { expect, signInByEmail, test } from "./support/fixtures";
import { callApi } from "./support/leads";
import {
  apiUrl,
  keyOf,
  newAddress,
  newPhone,
  openForm,
  postEnquiry,
  secondAgency,
  turnOnForm,
  viaProxy,
} from "./support/website-form";

test("the fourth submission from one address to one agency in ten minutes is refused; another agency still takes it", async ({
  page,
  request,
  browser,
  agency,
  database,
}) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const other = await secondAgency(database, browser);
  const otherKey = keyOf(await turnOnForm(other.owner));
  const visitor = viaProxy(newAddress());
  const { openedToken } = await openForm(request, key, { headers: visitor });
  const statuses: number[] = [];
  for (let turn = 0; turn < 4; turn += 1) {
    statuses.push((await postEnquiry(request, key, { phone: newPhone(), openedToken }, visitor)).status());
  }
  expect(statuses).toEqual([201, 201, 201, 429]);
  const refused = await postEnquiry(request, key, { phone: newPhone(), openedToken }, visitor);
  expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);

  const otherOpened = await openForm(request, otherKey, { headers: visitor });
  expect(
    (
      await postEnquiry(request, otherKey, { phone: newPhone(), openedToken: otherOpened.openedToken }, visitor)
    ).status(),
  ).toBe(201);
});

test("twenty enquiries with no readable address are taken, the next is refused, and the Owner is told once", async ({
  page,
  request,
  agency,
}) => {
  // Twenty-one sends and five more refusals, one after another.
  test.slow();
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const { openedToken } = await openForm(request, key);
  const statuses: number[] = [];
  for (let turn = 0; turn < 21; turn += 1) {
    statuses.push((await postEnquiry(request, key, { phone: newPhone(), openedToken })).status());
  }
  expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
  expect(statuses[20]).toBe(429);
  // However many more are refused, the Owner has one notice.
  for (let turn = 0; turn < 5; turn += 1) {
    expect((await postEnquiry(request, key, { phone: newPhone(), openedToken })).status()).toBe(429);
  }
  const bell = await callApi<{ notifications: { title: string }[] }>(page, "notifications.list", { limit: 50 });
  expect(bell.notifications.filter((notice) => notice.title === "Your website form is busy")).toHaveLength(1);
});

test("a forged leftmost entry is never the visitor's address, and one entry is no address", async ({
  request,
  page,
}) => {
  const visitor = newAddress();
  const forged = await request.get(`${apiUrl()}/api/public/client-address`, {
    headers: viaProxy(visitor, "9.9.9.9"),
  });
  expect(await forged.json()).toEqual({ address: visitor, entries: 3, hops: 1 });

  const single = await request.get(`${apiUrl()}/api/public/client-address`, {
    headers: { "x-forwarded-for": newAddress() },
  });
  expect(await single.json()).toEqual({ address: null, entries: 1, hops: 1 });

  // A browser comes through the web app's rewrite, which leaves the api with fewer than the two entries one hop needs: no
  // address there either (Vercel's own rewrite adds one entry; the standalone server adds none).
  const throughTheWeb = await page.request.get("/api/public/client-address");
  const report = (await throughTheWeb.json()) as { address: string | null; entries: number };
  expect(report.address).toBeNull();
  expect(report.entries).toBeLessThan(2);
});
